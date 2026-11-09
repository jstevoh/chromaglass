# tvos: the Apple TV app

A receiver for the Mac app's live plate (PLAN.md 12-tv-apple, in
`docs/plan/12-app-stores.md`): the Apple TV signs in to the player's account by a
short code, finds the show on the home network, and plays the Mac's WebRTC stream,
answering the same offer the `/tv` page answers. Nothing is sold on the TV.

## What is here

- `Package.swift`: the app's core, a Swift package that builds with the Command Line
  Tools on any Mac, and on Linux (with swift-crypto for CryptoKit), so CI checks it
  without Xcode or the tvOS SDK.
- `Sources/ChromaGlassTVCore/`:
  - `TvPass.swift`: the `cgtv1` pass the Worker signs, checked offline against the
    licence public key built into the app; a TV with no internet keeps playing until
    the pass runs out, and asks for a new one in its last week.
  - `TvSignIn.swift`: the client for the licence Worker's `/tv/code`, `/tv/poll` and
    `/tv/renew` (server/tv-code.js), and `linkTv`, which keeps a live code on screen
    until the phone links it.
  - `Relay.swift`: the messages the TV and the show's relay exchange at `/remote-ws`
    (hello, denied, tv-show, tv-signal), as `src/components/TvDisplay.tsx` writes them,
    and the Mac's "TV at home" address read into host, port and show key.
  - `Base64URL.swift`.
- `Sources/cgtv-probe/`: what `npm run tvswift` runs against the Worker's real handler.

The app target (SwiftUI screens, the video view over LiveKit's tvOS WebRTC build)
goes in `App/` and links the core; it needs Xcode with the tvOS SDK.

## Edges

The core reaches the Worker only through its public `/tv/` routes and the relay only
through its WebSocket messages; it shares no code with the web app. A change to either
side's messages is a change to `npm run tvswift`, which proves both together.

## Checks

```bash
npm run tvswift
```
