# plugin/dawbridge: the DAW bridge plugin

An AU effect and a VST3 (JUCE 8) that a DAW track carries to drive the running app:
32 automation slots, the host's transport and the track's audio, sent as OSC to
127.0.0.1:9024. The contract, every message and its timing, is `docs/dawbridge.md`;
the plan item is 13.7b in `docs/plan/13-vj-software.md`.

| File | What it is |
|---|---|
| `Source/BridgeProtocol.h` | The contract's numbers and addresses. `npm run dawbridge -- --plugin` reads them from this file. |
| `Source/PluginProcessor.*` | The processor. The audio thread writes into two lock-free FIFOs; a sender thread does the talking. |
| `Source/PluginEditor.*` | The window: whether the app is listening, the port, and what each slot is bound to. |
| `SelfTest/SelfTestMain.cpp` | `DawBridgeSelfTest`: the same processor sources, played as a host would, with no host. |

## Build (macOS)

Needs CMake 3.22 or later and Xcode's command line tools. JUCE is fetched at a pinned
tag into the build directory.

```bash
cmake -S plugin/dawbridge -B plugin/dawbridge/build -DCMAKE_BUILD_TYPE=Release -DDAWBRIDGE_INSTALL=ON
```

```bash
cmake --build plugin/dawbridge/build --config Release -j
```

`DAWBRIDGE_INSTALL=ON` copies `ChromaGlass Bridge.component` and `ChromaGlass Bridge.vst3`
into `~/Library/Audio/Plug-Ins`. Then:

```bash
auval -v aufx Cgbr Pltr
```

```bash
npm run dawbridge -- --plugin
```

The second runs `DawBridgeSelfTest` against the real show server and holds what arrives
to the contract. A built plugin is unsigned. It loads on the machine that built it.
Signing and a CI build are 13.7c.

## In a DAW

Put **ChromaGlass Bridge** on the track whose audio the ear should hear. It passes the
audio through unchanged. Turn on the DAW bridge in the app (More, Pro). The plugin
window then says "The app is listening", and the slots take the names the app binds them to.
