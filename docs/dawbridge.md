# The DAW bridge: the contract between the plugin and the app

PLAN 13.7 (`docs/plan/13-vj-software.md`, step 7). An AU and VST3 plugin for Logic and
Ableton Live that draws nothing. It sits on a track and sends the running ChromaGlass
app three things MIDI carries badly or not at all: a bank of automation slots at full
resolution, the host's transport with the bar's phase exact, and the track's own audio
as PCM, so the ear hears the DAW's mix with no loopback device.

This page is the wire between the two halves, written before either is built so that
two builders can work on them apart and `npm run dawbridge` can hold both to it. The
plugin (13.7b, `plugin/dawbridge/`) and the app's half (13.7a, `server/dawBridge.js`
and `src/lib/dawBridge.ts`) each turn their own lines of that check green. A change to
anything on this page is a change to both halves and to the check, in one PR.

## Why OSC over UDP on localhost

The plugin speaks OSC 1.0 over UDP to `127.0.0.1`, on a port of its own (not the OSC-in
port 9000, which Resolume and TouchDesigner use and which listens on the network).

- **JUCE has it.** `juce_osc`'s `OSCSender` and `OSCReceiver` write and read every type
  used here (int32, float32, string, blob). A WebSocket client in a plugin would be a
  third-party library inside every DAW's process.
- **No connection to keep.** A DAW loads, saves and reloads plugins at will, often with
  the app not running. A datagram to a closed port costs nothing, and the plugin never
  waits on the app, which an audio thread must not.
- **Localhost only, by the operating system.** The server binds the bridge's socket to
  `127.0.0.1`, so nothing on the network can reach it, and drops any datagram whose
  source is not loopback all the same.
- **Big enough.** 512 stereo float32 frames are 4 KB, well under macOS's 9216-byte
  datagram on loopback.

The plugin never sends from its audio thread: `processBlock` writes into a lock-free
FIFO and a sender thread drains it.

## The port

`9024` by default. The show server reads `DAW_BRIDGE_PORT` (`0` turns the bridge off);
the plugin has a port field in its window, `9024` until changed. Its banner prints
`DAW bridge:         udp 127.0.0.1:<port>` when the bridge is on.

## Plugin to app (OSC, big-endian as OSC is)

Protocol version **1**. Addresses and argument types, exactly:

| Address | Tags | Arguments | When |
|---|---|---|---|
| `/chromaglass/bridge/hello` | `,issfi` | protocol version (1), instance id (random, fixed for the plugin instance's life), host name (`"Ableton Live 12"`, `"Logic Pro"`, as JUCE's `PluginHostType` says), sample rate (Hz), latency (samples: the plugin's own plus the host's output latency, 0 if unknown) | on `prepareToPlay`, then once a second |
| `/chromaglass/bridge/slot` | `,if` | slot (0–31), value (0–1, the parameter's normalised value) | when a slot's value changes, at most once a block a slot |
| `/chromaglass/bridge/transport` | `,ififfiif` | playing (1 or 0), bpm, song position in quarter notes split as whole (int) and fraction (float, 0 ≤ f < 1), the position within the bar in quarter notes (`ppq − ppqOfLastBarStart`), time signature numerator, denominator, ahead (seconds until the block's first sample is heard; 0 if unknown) | every block while playing, throttled to one every 10 ms; at once on a change of play state, tempo or a locate; every 250 ms while stopped |
| `/chromaglass/bridge/pcm` | `,iiib` | channels (1 or 2), sample rate (Hz), sequence (the frame index of the packet's first frame since `prepareToPlay`, wrapping at 2³¹), blob of interleaved float32 **little-endian** samples, at most 512 frames | every block, cut into packets of at most 512 frames |
| `/chromaglass/bridge/bye` | `,s` | instance id | on release (the plugin removed or the DAW closing) |

The position is sent as two numbers because `juce_osc` has no 64-bit double, and a
float32 song position is a quarter of a millisecond off by bar 500. The position is the
block's first sample's; `ahead` says when that sample reaches the speakers, so the app
can put the beat where it is heard rather than where it was computed.

There are 32 slots, always, so the DAW's automation list never changes shape. The
plugin's parameters are named `Slot 1` to `Slot 32` until the app names them (below).

## App to plugin (OSC)

| Address | Tags | Arguments | When |
|---|---|---|---|
| `/chromaglass/bridge/names` | `,s` × 32 | what each slot is bound to (`"Swirl"`, `"Go: Fillmore"`, `""` for unbound) | to the address the last hello came from, on that hello and whenever a binding changes |

The plugin shows the names in its own window and, where the host allows it, as the
parameters' names (`updateHostDisplay` with `withParameterInfoChanged`); Live and
Logic differ in whether a lane's title follows.

## The show server (`server/dawBridge.js`, beside `abletonLink.js`)

- **One plugin at a time.** The first instance to say hello is followed, by the address
  and port its datagrams come from (each instance has its own socket; the slots, the
  transport and the audio carry no instance id). Anything from another address is
  ignored until the followed one says bye or is quiet for 3 seconds, after which the
  next hello is followed.
- **Pro only**, through the same gate as OSC and Link. On a Free or Home show the
  server takes nothing from the bridge and tells the page `locked`.
- **Localhost only**: the socket is bound to `127.0.0.1`.
- Nothing is buffered: each datagram is turned into its message and sent on at once.

## Server to the page (the laptop's display, `/remote-ws`)

JSON, as every other message on the relay:

```js
{ type: 'daw', on: true, instance, host, sampleRate, latency }   // on the followed hello's first arrival, and to a display when it joins
{ type: 'daw', on: false }                                     // on bye, or 3 s quiet
{ type: 'daw', on: false, locked: true }                       // a hello on a show that is not Pro
{ type: 'daw-slot', slot, value }                              // value as the plugin sent it, a float32 widened
{ type: 'daw-transport', playing, bpm, beat, barBeat, num, den, ahead }   // beat = whole + fraction
```

The audio as a **binary** WebSocket frame, to displays only (phones never see it):

| Bytes | Field |
|---|---|
| 0–3 | `CGPC` (ASCII) |
| 4 | channels (1 or 2) |
| 5–7 | 0 |
| 8–11 | sample rate, uint32 little-endian |
| 12–15 | sequence, uint32 little-endian |
| 16– | the samples, float32 little-endian, interleaved, as the plugin sent them |

The page sends `{ type: 'daw-names', names: [32 strings] }` when the bindings change, and
the server sends them on as `/chromaglass/bridge/names`. None of the `daw` messages is
relayed to phones, either way.

## The page (`src/lib/dawBridge.ts`, `src/lib/tempo.ts`, `src/lib/midi.ts`)

What `npm run dawbridge` imports, so these names and shapes are part of the contract:

- `src/lib/dawBridge.ts` exports `DAW_SLOTS` (32), `DAW_PORT` (9024), `DAW_PROTOCOL` (1),
  `decodeDawPcm(data: ArrayBuffer | Uint8Array): { channels, sampleRate, seq, samples: Float32Array } | null`
  (null for anything that is not a `CGPC` frame), `dawSlotSource(slot): MidiSource`, and
  `dawSlotSettings(map: MidiMap, slot: number, value: number): Partial<VisualizerSettings>`:
  the settings a slot move writes through the map.
- **Slots are bound like controllers.** `MidiSource['kind']` gains `'slot'`, with
  `channel: 0` and `number` the slot. The learn flow and the binding map are MIDI
  learn's (§5): a slot is learned by moving it in the DAW, as a knob is. A slot bound to
  a setting gives `valueAt(value, min, max, curveOf(key))` at the slot's full float
  resolution, never rounded to CC's 128 steps and never held by soft takeover (the
  DAW's lane is the truth, as an OSC setting is); a slot bound to an action or a preset
  fires when the value crosses 0.5 upward.
- **Transport is a tempo source.** `TempoSourceKind` gains `'daw'`, and
  `TempoSource.dawReading(now, m)` takes a `daw-transport` message stamped on arrival. The
  beat `m.beat` falls at `now + m.ahead · 1000`; the beat zero is worked back from it as
  `linkReading` does, keeping the least late arrival. While the DAW plays, `read()` says
  `source: 'daw'`, the period `60000 / bpm`, `beatAt` where a whole beat fell, and `bar`
  the beat's place in the bar (`floor(barBeat)` in x/4). Ranked under Link (when Link is
  on and has peers) and over MIDI clock, tap and a set tempo; a DAW that stops, or has
  sent nothing for 500 ms, hands back to whatever was driving before.
- **The ear's source "DAW".** `AudioSource` (`src/app/shared.ts`) gains `'daw'`, chosen
  as the other sources are (the Source picker, and `chromaglass-audio-source` in session
  storage). Its samples are the `CGPC` frames, played into the ear's analyser through an
  AudioWorklet, silent to the speakers (the DAW already plays them), with the hello's
  latency handed to the ear's alignment (14e).

## The plugin (`plugin/dawbridge/`, JUCE, CMake)

- `Source/BridgeProtocol.h` holds `kProtocol = 1`, `kSlots = 32`, `kPort = 9024` and the
  five addresses above as string constants, spelled exactly as here: the check reads
  them from that file and compares.
- An AU effect and a VST3, manufacturer code `Pltr`, AU subtype `Cgbr`
  (`auval -v aufx Cgbr Pltr`). It passes its audio through untouched.
- A console target `DawBridgeSelfTest` that links the real processor, plays it four
  seconds at 120 bpm in 4/4 at 48 kHz in blocks of 256 with a 60 Hz kick on every beat,
  moves slot 3 from 0 to 1 over the run, and sends to `--port <n>` (`npm run dawbridge
  -- --plugin` runs it against the real server).

## What the check holds (`npm run dawbridge`)

Lines with ids, owed on main until the PR that builds them takes the id out of
`--owed` in `scripts/checks.json`: `app` (13.7a: the server and the page) and `plugin`
(13.7b). With `--plugin`, on a Mac with the plugin built, the self-test's packets are
held to the same server lines and `auval` must pass; without it those lines print
`skip`. The timings: a slot move reaches the display within one frame (16 ms); a PCM
packet within 5 ms (95th percentile), with no packet lost and every sample as sent; a
tempo change reaches the page's tempo within a beat; each beat where it fell to 2 ms.

What no fake can say: that Live and Logic load the plugin, automate a slot and play the
plate on the bar. That is the owner's sitting on the Mac (`docs/judging.md`).
