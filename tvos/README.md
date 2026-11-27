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
  - `Receiver.swift`: the receiver's logic as one value, `ReceiverMachine` (events in,
    actions out): the /tv page's connection rules (TvDisplay.tsx, useRemoteLink.ts)
    with nothing platform in it, so they are checked on any machine with Swift.
  - `ReceiverDriver.swift`: runs the machine against URLSession's WebSocket to the
    relay, real timers, and a `PeerLink`, the one protocol the app implements over
    LiveKit's WebRTC build.
  - `Base64URL.swift`.
- `Sources/cgtv-probe/`: what `npm run tvswift` runs against the Worker's real handler
  and a stand-in for the Mac's relay.

- `Video/`: the video link, a package of its own because it links LiveKit's
  `webrtc-xcframework` (a binary of Google's libwebrtc with a tvOS slice), which only a
  Mac can link. `LiveKitPeer` is the core's `PeerLink` over it: no ICE servers, receive
  only, "connected" reported apart from the first frame. `cgtv-video-probe` is what
  `npm run tvvideo` runs: the receiver against a Chromium page sending real WebRTC.
  It builds with the Command Line Tools on macOS (the macOS slice), no Xcode needed.
- `App/`: the tvOS app, an XcodeGen spec (`project.yml`) over SwiftUI screens:
  - `AppModel.swift`: sign in by code, keep the pass fresh, take the show's address;
  - `ChromaGlassTVApp.swift`: the code screen (the code, a QR of the phone's link
    page) and the address screen;
  - `ShowView.swift`: the plate in `LKRTCMTLVideoView`, with the /tv page's words over
    it while it is not live;
  - `PassStore.swift`: the pass and the address in the keychain, this device only.

  The licence Worker's address and the signing team go in a git-ignored
  `App/Local.xcconfig` (copy `Local.xcconfig.example`). To build:

  ```bash
  brew install xcodegen
  cd tvos/App && cp Local.xcconfig.example Local.xcconfig && xcodegen generate
  ```

  then open `ChromaGlassTV.xcodeproj` in Xcode and run on the tvOS simulator.

## TestFlight and the App Store

The App Store record is "ChromaGlass TV", bundle `app.chromaglass.tv`. The team has
no registered devices, so Xcode's development signing fails at archive time; the
archive is built unsigned and the export signs it in the cloud with the team's App
Store Connect API key (kept by the owner, outside the repo). Every upload needs a
build number App Store Connect has not seen:

```bash
cd tvos/App && xcodegen generate && xcodebuild -project ChromaGlassTV.xcodeproj -scheme ChromaGlassTV -configuration Release -destination generic/platform=tvOS -archivePath build/ChromaGlassTV.xcarchive CODE_SIGNING_ALLOWED=NO CURRENT_PROJECT_VERSION=<n> archive
```

then `xcodebuild -exportArchive` with an export options plist of `method`
`app-store-connect`, `destination` `upload`, `signingStyle` `automatic` and the
team id, plus `-allowProvisioningUpdates` and the three `-authenticationKey…`
flags. `Info.plist` reads its versions from `MARKETING_VERSION` and
`CURRENT_PROJECT_VERSION`, so the number passed to the archive is the build
number that goes up.

The camera and microphone purpose strings in `project.yml` are there only because
LiveKit's WebRTC framework links the capture APIs; App Store Connect refuses a
build without them (ITMS-90683, build 1). The app never asks for either.

## Edges

The core reaches the Worker only through its public `/tv/` routes and the relay only
through its WebSocket messages; it shares no code with the web app. A change to either
side's messages is a change to `npm run tvswift`, which proves both together.

## Checks

```bash
npm run tvswift
```

```bash
npm run tvvideo
```

`tvswift` runs anywhere with Swift (Measure's logic shard); `tvvideo` only on a Mac, and
`.github/workflows/tvos.yml` runs it with the app's simulator build when a PR touches
`tvos/`.
