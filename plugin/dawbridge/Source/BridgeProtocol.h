// The wire between this plugin and the ChromaGlass app, as docs/dawbridge.md lays it
// out. `npm run dawbridge -- --plugin` reads the numbers and the six addresses below
// out of this file and compares them with the contract's own, so they are spelled here
// exactly as there and nowhere else in the plugin: everything that sends or reads a
// message takes its address from this header.
//
// A change here is a change to the contract, which is a change to the app's half
// (server/dawBridge.js, src/lib/dawBridge.ts) and to the check in the same PR.

#pragma once

namespace dawbridge
{
// The protocol's version, sent first in every hello. The show server follows a hello
// of the version it knows and nothing else.
constexpr int kProtocol = 1;

// Thirty-two automation slots, always, so the DAW's automation list never changes
// shape between the app's bindings.
constexpr int kSlots = 32;

// The bridge's UDP port on 127.0.0.1. Not the OSC-in port 9000, which Resolume and
// TouchDesigner use and which listens on the network. The plugin's window can change it.
constexpr int kPort = 9024;

// At most this many frames of audio in one PCM datagram: 512 stereo float32 frames are
// 4 KB, well under macOS's 9216-byte datagram on loopback.
constexpr int kMaxPcmFrames = 512;

// Plugin to app.
constexpr const char* kHello = "/chromaglass/bridge/hello";
constexpr const char* kSlot = "/chromaglass/bridge/slot";
constexpr const char* kTransport = "/chromaglass/bridge/transport";
constexpr const char* kPcm = "/chromaglass/bridge/pcm";
constexpr const char* kBye = "/chromaglass/bridge/bye";

// App to plugin: what each slot is bound to, 32 strings.
constexpr const char* kNames = "/chromaglass/bridge/names";

// How often the sender speaks unprompted (docs/dawbridge.md's "When" column).
constexpr double kHelloEverySeconds = 1.0;
constexpr double kTransportPlayingEverySeconds = 0.010;
constexpr double kTransportStoppedEverySeconds = 0.250;
} // namespace dawbridge
