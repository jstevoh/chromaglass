# Playing ChromaGlass over OSC

Resolume, TouchDesigner, Max, Ableton (Connection Kit), a lighting desk and the
phone OSC apps can all play the show: cue presets, fire the desk's actions, move
settings and put a hand on the plate. This page is every address the show server
takes, with a starter map for Resolume and a script for TouchDesigner. The short
version, and what OSC means for who can reach the show, is in the
[guide](guide.md#osc).

## Turning it on

- **The Mac app:** *Show → OSC input → This Mac only* (Resolume or TouchDesigner on
  the same laptop) or *From the network* (a second computer or a desk). It starts
  off, applies at once and is kept between launches. *Show → Show Server Details…*
  names the port.
- **The website, from a laptop:** `npm run show` updates and builds the site and starts the show
  server, which listens on UDP port 9000 (`OSC_PORT=…` to move it, `OSC_PORT=0` to
  close it, `OSC_BIND=127.0.0.1` to keep it to this computer). Open the address it
  prints; the browser page is the display the OSC plays.
- OSC in is **Pro**. Below Pro the port is open and what arrives is ignored, and
  Show Server Details says so.

Send to the laptop's address (127.0.0.1 from the same machine) on port 9000.

## The addresses

Every address starts `/chromaglass/`; anything else on the port (Resolume's own
`/composition/…`, say) is ignored.

| Address | Arguments | What it does |
|---|---|---|
| `/chromaglass/setting/<key>` | a number, or `true` / `false` | Sets one setting. The number is taken as it is and the app holds it to the setting's own travel. |
| `/chromaglass/action/<name>` | none, or 1 to fire; 0 fires nothing | One of the desk's actions (below). A button's press (1) fires it and its release (0) does not, so one press is one blackout. |
| `/chromaglass/preset` | the preset's id, a string | Cues a look. |
| `/chromaglass/preset/<id>` | none, or 1 to fire; 0 fires nothing | The same, for a program that can only send a number from a button. |
| `/chromaglass/drop` | x y [amount] | Dye at a point. x and y run 0 to 1 across the plate, y up; amount 0 to 1, 0.5 if left out. |
| `/chromaglass/blow` | x y [amount] [dx dy] | Air at a point, with a direction if given. |
| `/chromaglass/press` | x y [amount] | A hand on the top glass: the film thins and the dye rings out. |
| `/chromaglass/tilt` | x y | Rocks the plate; each -1 to 1, held at the edge past it. |
| `/chromaglass/dye` | `#rrggbb` (the `#` may be left off) | The dropper's colour. |

Arguments may be floats (what Resolume and TouchDesigner send), ints (Max, a norns
script), strings or OSC's true and false. Bundles are opened and every message in
them is played, in order.

### Actions

| Name | What it does |
|---|---|
| `go`, `back` | The desk's Go and Back: crossfade to the armed look, or back to the one before |
| `preset-next`, `preset-prev` | Step through the preset list (each clears the plate and reseeds) |
| `lucky` | A random look, as the desk's Lucky button rolls it |
| `seed`, `clear`, `drain` | Drop new colour, clear the plate, drain it |
| `play`, `pause` | The plate's motion |
| `automate-on`, `automate-off` | Evolve |
| `blackout-toggle` | The house lights down to black, and back |
| `overlays-off`, `overlays-on` | Hide everything over the plate for a clean projected frame |
| `seq-play`, `seq-pause`, `seq-next`, `seq-prev`, `seq-stop` | The Sequence's transport |
| `record-toggle` | Record the show to a video file, and stop |
| `performance-toggle` | Record a performance: what is painted, with the song |
| `mix-fade-led`, `mix-fade-gel`, `mix-fade-lumia`, `mix-fade-front`, `mix-fade-back`, `mix-fade-film`, `mix-fade-mark` | A Mixer row's take button: out over its fade, or back in |
| `live-stop` | End the Mac app's live stream (going live is only from the desk) |

### Presets

The built-in looks by id: `classic`, `comet`, `galaxy`, `cyberpunk`, `acid-trip`,
`bass-drop`, `microscopic-chaos`, `aurora-borealis`, `solar-flare`,
`jellyfish-bloom`, `fractal-dream`, `velvet-underground`, `neon-coral-reef`,
`stardust-collapse`, `lumia`, `turing-print`, `poster-1969`, `macro-bead`,
`cell-bloom`, `lace-run`, `crowd-plate`, `milk-marble`, `soap-film`,
`oil-and-water`, `red-cabbage`, `chemical-clock`, `magnet-garden`, `home-movie`,
`clock-glass`, `splodascope`, `ferro-paint`, `roy`, `lava-lamp`. A look you saved
yourself has an id starting `user-`.

### Settings worth a fader

Any setting MIDI learn offers can be sent (the full list, with each one's travel,
is `LEARNABLE_SETTINGS` in `src/lib/midi.ts`). These run 0 to 1, so a 0 to 1 slider
plays them one to one:

| Key | Setting |
|---|---|
| `audioImpact` | Sound Drive: how hard the music plays the plate |
| `dimmer` | Dimmer: the house brightness, 0 is black |
| `bloom` | Bloom: the glow round the highlights |
| `turbulenceScale` | Turbulence |
| `plateRock` | Plate Rock: a hand tipping the dish on the beat |
| `beatSqueeze` | Beat Squeeze: the rhythm plate pressed on each kick |
| `beatAccent` | Accent the One |
| `fingering` | Fingering: the press's rim breaking into fingers as the glass lifts |
| `automateRate` | Evolve Speed |
| `lampGround` | Lamp Ground: dye as light on black, up to the lamp through it |
| `bubbles` | Bubbles |
| `iridescence` | Iridescence |

Three that do not run 0 to 1: `globalSpeed` (Speed, 0 to 0.3), `macroZoom` (Macro
Zoom, 1 to 16) and `hueJourney` (Hue Journey, 0 to 10 minutes a step). Scale them in
the sending program, or put them on MIDI learn, which maps a fader to the travel
(scaling another program's ranges in the server is PLAN 34a-7i).

### Try it

Each line is an address and its arguments, as the sending program would send them.
`npm run rig` sends every line of this block to a real show server and checks that
each arrives as what the tables above say, so the examples here are known to work.

```osc
/chromaglass/preset galaxy
/chromaglass/preset/lava-lamp
/chromaglass/action/go
/chromaglass/action/blackout-toggle 1
/chromaglass/action/lucky
/chromaglass/action/preset-next
/chromaglass/action/seq-play
/chromaglass/setting/audioImpact 0.8
/chromaglass/setting/dimmer 0.5
/chromaglass/setting/bloom 0.3
/chromaglass/setting/turbulenceScale 0.6
/chromaglass/setting/plateRock 0.4
/chromaglass/setting/beatSqueeze 0.7
/chromaglass/setting/automateRate 0.2
/chromaglass/setting/lampGround 0.5
/chromaglass/setting/globalSpeed 0.05
/chromaglass/drop 0.5 0.5 0.8
/chromaglass/blow 0.3 0.6 0.5 1 0
/chromaglass/press 0.5 0.5 0.7
/chromaglass/tilt 0.4 -0.2
/chromaglass/dye #ff6a00
```

## A starter map for Resolume

Resolume's OSC output sends its own addresses, so each control you want to send
gets a *custom output address* in the shortcut editor (Resolume's manual:
[Custom OSC Messages](https://resolume.com/support/en/osc#custom-osc-messages)).
Once:

1. In ChromaGlass, *Show → OSC input → This Mac only*.
2. In Resolume, *Preferences → OSC*: turn on *OSC Output*, send to *Localhost*,
   outgoing port `9000`.
3. *Shortcuts → Edit OSC* (Shift ⌘ O). For each row below, click the control,
   enable its OSC output, and replace the address Resolume filled in with the one
   in the table. Esc to finish; Resolume keeps the map in its current OSC preset.

The composition's Dashboard knobs are a good home for the faders: they are 0 to 1,
and you can name them in Resolume after what they play.

| Resolume control | Custom address | Plays |
|---|---|---|
| Dashboard knob 1 | `/chromaglass/setting/audioImpact` | Sound Drive |
| Dashboard knob 2 | `/chromaglass/setting/dimmer` | Dimmer |
| Dashboard knob 3 | `/chromaglass/setting/bloom` | Bloom |
| Dashboard knob 4 | `/chromaglass/setting/turbulenceScale` | Turbulence |
| Dashboard knob 5 | `/chromaglass/setting/plateRock` | Plate Rock |
| Dashboard knob 6 | `/chromaglass/setting/beatSqueeze` | Beat Squeeze |
| Dashboard knob 7 | `/chromaglass/setting/automateRate` | Evolve Speed |
| Dashboard knob 8 | `/chromaglass/setting/lampGround` | Lamp Ground |
| A button | `/chromaglass/action/go` | Go to the armed look |
| A button | `/chromaglass/action/blackout-toggle` | Blackout, and back |
| A button | `/chromaglass/action/lucky` | A new look |
| A button per look | `/chromaglass/preset/galaxy`, `/chromaglass/preset/lava-lamp`, … | Cue that look |

A button sends 1 on its press and 0 on its release; the show fires on the 1 only.
A Resolume slider sends 0 to 1 whatever the setting's travel, so leave Speed,
Macro Zoom and Hue Journey off this map. Nobody has tried this map in Resolume
itself yet: that is the owner's sitting in `docs/judging.md` §93.

## A starter for TouchDesigner

[`osc/chromaglass_touchdesigner.py`](osc/chromaglass_touchdesigner.py) is a Text DAT
module over an OSC Out DAT: `mod.chromaglass.preset('galaxy')`,
`mod.chromaglass.action('go')`, `mod.chromaglass.setting('dimmer', 0.5)`, and the
plate's hands (`drop`, `blow`, `press`, `tilt`, `dye`). Its header says how to wire
it, and how a CHOP Execute DAT plays a CHOP's channels, named after settings, as
settings.

## OSC out: the plate to a VJ app

The show also *sends* OSC: the plate's colour, what the ear hears and each beat the plate
presses on, so a Resolume layer's hue can sit on the dye and a strobe can land on the kick
the plate itself pressed on (PLAN 13.5-osc). Turn it on in *Settings → Sound*, under the
tempo: **OSC out**, beside where it sends. It goes to `127.0.0.1:7000` (Resolume's own OSC
input port, on this Mac) until you type another `address:port`: another machine's Wi-Fi
address, or the network's broadcast address (`192.168.1.255:7000`) for every machine on it.
The switch is offered only where a show server is there to send the UDP (the Mac app, or
`npm run show`; `OSC_OUT=host:port` turns it on at launch), is remembered on this machine,
and is the same row on the phone layout. It is **Pro**, like OSC in: below Pro the line
beside it says so and nothing leaves.

Each report goes as one bundle, twenty times a second; the beat goes alone the moment it
lands. One float per address, which is what Resolume's shortcuts, VDMX and TouchOSC map:

```
/chromaglass/out/colour/red        0..1   the plate's colour, each layer weighted by how full it is
/chromaglass/out/colour/green      0..1
/chromaglass/out/colour/blue       0..1
/chromaglass/out/colour/hue        0..1   0 red, 0.33 green, 0.67 blue
/chromaglass/out/colour/brightness 0..1   its brightest channel
/chromaglass/out/layer/1/red       0..1   each layer the same way (green, blue, fill), from 1
/chromaglass/out/master            0..1   the room's dimmer the rig gets; 0 in a blackout
/chromaglass/out/sound/level       0..1   the ear's fast readings: level kick bass snare hats note
/chromaglass/out/band/1            0..1   the ear's eight bands, 1 lowest
/chromaglass/out/bpm               bpm    the beat clock's tempo, 0 before it has one
/chromaglass/out/beat              1, 0   1 on each beat, 0 a twentieth of a second later
```

In Resolume, *Preferences → OSC → OSC Input* on port 7000, then *Shortcuts → Edit OSC*,
click the parameter (a layer's hue, a strobe's trigger) and give it the address above. In
TouchDesigner an *OSC In CHOP* on port 7000 makes a channel of each address. Nothing under
`/chromaglass/out/` is an address the show acts on, so an app that echoes what it hears
back to port 9000 does not drive the show with its own feed. `npm run oscout` checks the
bytes, the numbers and the switch.

## What OSC does not do yet

- Scale a 0 to 1 slider to a setting with another travel (PLAN 34a-7i).
