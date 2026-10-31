# src/lib

Plain TypeScript shared by the app, the lab and the node harnesses. No components.

## Start here

- `platform.ts`: `detectTier`, `GpuClass`, `QualityRung`.
- `lookFade.ts`: `lookOf`, `lookStep`: changing look without a cut.
- `sceneMap.ts`: the patch bay, `PATCH_TARGETS`, `cordReading`.
- `audioFeatures.ts`: named bands and onsets, `SOUND_SOURCES`; it re-exports `analyserEmulator`.
- `checkHooks.ts`: every `window.chromaglass*` and `window.__cg*` name the app and the checks share.

## Contracts

- Never imports `components/`, `app/`, `sim/`. From `hooks/` only the type `AudioData` (`sceneMap`, `songTrack`); from `gpu/` only `MAGNET_RADIUS` (`magnetSize`). Otherwise `src/types` and `src/constants`.
- `src/gpu` imports a handful from here (dye, turntable, slosh, rimMask, deltaRows, crashLog and others), and its `wgsl/` only number-only ones (turntable, dye, liquidProps, handSolid, filmTable); `sim/` and `hooks/` import many.
- `useSignedIn`, `cloudSyncApp` and `accountShows` export React hooks; `songMapWorker` and `fingerprintIndexWorker` are Web Worker entries.
- `licenseKey` and `cloudSync` are the device's half of `server/license-key.js` and `server/cloud-sync.js`; `remoteProtocol` is the wire `server/remote-server.js` relays.

## Files

About 160 files, grouped; a name is its file.

**Fluid physics.** beads: oil beads. breath: Blow as air. bubbleDye: dye round a bubble. bubbles: trapped air as pockets in the gap (BubbleField: `liquid(settings)`, `step(dt, velocity, tiltX, tiltY, agitation)`, `pack()`). chemistry: live reactions. deltaRows: CPU rows to hand the GPU. detailFlow: closeup cell clock. dripPace: drop fall time. dye: absorbance. dyeTarget: fill target. filmTable: thin-film colour. handCarry: hand carries ferro. handSolid: Finger as solid. lampBoil: lamp heat. liquidColour: pour colour. liquidFile: liquid files. liquidPhase: which liquid where. liquidProps: species. magnetSize: magnet reach. oilLay: Clock Glass oil. phasePour: ferro pour. plateRock: tipping the dish. pressRing: press squeeze. rimMask: cells inside the rim. roomStir: room to liquid. sheet: rhythm sheet. slosh: two-layer slosh. soapFilm: soap film reference. squish: top glass. stir: turbulence. turingInk: Turing colour. turntable: spinning dish. videoFlow: a video as dye and flow.

**Rendering, projector, recording.** ambient: TV mode. backLook: back plate. drawGate: draw clock. flashGuard: no strobe. governor: quality rung. intro: opening mark. lampKelvin: lamp warmth. frameTaps: frame task's canvas copies. liveFrame: stream's frames from the frame task. liveStream: live stream encoder. macroCamera: closeup. markFit: logo for cast. muxMp4, muxShared, muxWebm: muxers. outputConfig: projector and wall. plateSources: surface sources. recordChoice: Record button. render: song render. showClock: live or fixed clock. stepClock: steps a frame.

**Sound.** analyserEmulator: offline analyser. audioCalibration: room trim. audioFeatures: bands, onsets. barGrid: strong beats. beatClock: beats ahead. chroma: note classes. earClock: hidden-window ear. evolution: per-track seed. fft: FFT. fingerprint: song ID proxy. fingerprintIndexBuild, fingerprintIndexWorker: local index. followedPlace: place in song. handSounds: operator's clicks. hitSource: hits for patches. localFingerprint: local ID. lyrics: LRCLIB. melodyWalk: the melody across the plate. musicDb: IndexedDB. musicLibrary: shipped music. musicTypes: types. phrasing: breaths. pitchFine: melody pitch. plateDrone: plate as band. simulatedMusic: fake band. songBoundary: song ends. songFollow: live follow. songMap, songMapAnalysis, songMapWorker: song maps. songRef: song match. songScore: timeline. songShape: builds, drops. songTrack: render's ear. soundLevels: levels. systemTap: Mac System audio. tempo: tempo sources. tempoPace: speed to tempo.

**Show.** areaCords: cords per area. autoMap: learn a controller. cameras: camera choice. cartoons: shipped cartoons. controllerSurface: controller faces. drift: Evolve wander. lookFade: look change. lucky: backdrop colours. midi: bindings. midiTouch: touch flash. mixer: picture stack. mixFade: row fades. modulators: shapes. padColours: pad palette. performanceTake: takes. plateAreas: dish areas. ride: fader ride. rng: show seed. sanitizeSettings: patch clamp. sceneMap: patch bay. scenePacing: pacing. sceneSense: room camera. sequencer: show sequence. setList: set list. showKit: show export. slowEvolve: Evolve timing. songShows: per-song show. soundLearn: sound triggers. timecode: MIDI timecode. userPresets: preset files. videoSense: video reading.

**Desk and phone helpers.** controlHelp: hover text. deskLayout: layouts. deskPins: pinnable faders. deskTabs: tabs. knobDrag: knob drag. phone: phone layout, tilt. playGesture: Play's fingers. qr: QR code. readout: value text. settingsMap: settings map. slideTray, strobeRing, tapeReels, vuMeter: desk dials. tipDelay, titleTips: tips. toolAmount: per-tool amount.

**Accounts and licence.** accountLicense: account key. accountShows: shows directory. authFlag: signed-in cache. cloudSync, cloudSyncApp: Pro sync. firebaseAuth: sign-in. licenseKey: key check. macSeat: Mac seats. tierGates: tier gates. useSignedIn: accounts on.

**Mac and iPhone bridges.** appLink: iPhone app link. castProtocol: casting. macApp: Mac download. padPicture: remote's picture. remoteProtocol: phone remote.

**App infrastructure.** bench: grid sweep. checkHooks: the checks' `?debug` doors. crashLog: black box. platform: where it runs. showPath: site paths. unhandled: exhaustive switch.

## Checks

`npm run quick`. Looks, set list: `desk`, `setlist`, `panel`. Areas: `areacords`, `plate`. Sound: `shelf`, `music`, `ears`, `renders`, `kicks`, `clicks`. Patch bay: `soundcords`, `scene`. Mixer: `mixer`, `rowfade`, `remotemix`. Projector: `map`, `beams`, `wallpattern`. Bridges: `applink`, `phonelink`. `governor`: `rungs`. `crashLog`: `crash`. `cartoons`: `cartoons`. `deltaRows`: `frameuploads`. `videoFlow`: `videoflow`.
