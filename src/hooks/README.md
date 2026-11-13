# src/hooks

React hooks that own a device, a browser API or a clock (microphone, MIDI, cameras, projector, recorder, remote link) and hand its readings to the app. The arithmetic lives in `src/lib`; a hook is the glue.

## Start here

- `useAudioAnalyzer.ts`: `useAudioAnalyzer`, `AudioData`, `Ear`: the show's ear. `Ear.view` is its ten-a-second reading as a store, not state (PLAN 46f): `useEarView.ts` has `EarView` (`get`, `subscribe`), `createEarView` and `useEarView(view, select)`, which renders the component that calls it only when what it selects changes. `Ear.live` is every reading, for readers on their own clock. Nothing above a readout renders for a reading: a new reader of the level is a leaf with `useEarView`, never state in `App()`.
- `useMidi.ts` (37 KB, grep it): `useMidi`, `MidiHost` (`playSetItem`), `MidiDevice`, controller maps, clock and timecode. Its result's `open` (PLAN 44k-14) says Web MIDI answered, what the assistant's MIDI switch waits for.
- `useMusicIntelligence.ts` (38 KB, grep it): song ID, song maps, performances. Its second argument is the ear's `live` ref, read on the hook's own timers (it was the ear's state, PLAN 46f). `positionNow()` reads the song's position at the call (`state.positionSec` is set every 500 ms). `listenNow()` asks the song ID to try at once, and `state.heardMap` keeps the map a first listen made after its song ends (Listen, PLAN 28h-8).
- `useShowSequencer.ts`: transport over a `ShowSequence`'s stages.
- `useProjector.ts`: `useProjector`, `pickProjector`, `ProjectorMode`.

## Contracts

- Imports `src/lib`, `src/types`, `presets`, `constants`, React. No components (`useSongRender` takes `FrameDigest`, `VisualizerRender` from `sim/frameTypes.ts`, types only). Never `src/gpu`.
- Called from `App.tsx` and from the hooks in `src/app/` (several name the hook file they wrap in their headers). Components take `useEarView` and `EarView` (`components/EarLeaves.tsx`: `EarPercent`, `EarMeters`; `settings/SoundSection.tsx`'s room readout), `useEscape`, `useMidiTouch`, `useRemoteLink`, `useGamepad`, `useWakeLock` and the types `TabEdit`, `MidiController`, `Recorder`, `SongRenderState`, `SongShowStatus`.
- `lib/sceneMap`, `lib/songTrack`, `constants.ts` and `sim/` take the type `AudioData` from `useAudioAnalyzer`.

## Files

- `useCameras.ts`: cameras plugged in.
- `useCastSession.ts`: casting, sender side (`useCastSender`).
- `useDeskLayout.ts`: `useDeskTabs`, `TabEdit`, the desk's tabs; its `restore(change)` commits any change to the list as an edit is, for the owner's assistant's Undo (PLAN 44k-17, `app/deskNow.ts`).
- `useDeviceTilt.ts`: phone tilt as Gravity.
- `useEscape.ts`: Esc closes.
- `useMoirePreview.ts`: whether the moiré pack's controls move here, and a copy without it a minute's try (the desk's Moiré Sheets section and the phone's Looks sheet both call it; PLAN 45a).
- `useEarView.ts`: the ear's view as a store, and the hook a readout subscribes with.
- `useFilmSense.ts`: the film, read back.
- `useGamepad.ts`: game controller as a hand.
- `useMidiTouch.ts`: flash on a controller touch.
- `usePreviewFrame.ts`: where the plate is painted.
- `useRecorder.ts`: record the canvas. `videoFormats(includeAudio)` lists the containers this browser's encoder writes (PLAN 44k-11, for the owner's assistant to be refused one it lacks).
- `useRemoteLink.ts`: laptop side of the phone remote; also a network display's, and a TV's at home (role `tv`, PLAN 12-tv).
- `useSceneCamera.ts`: the room camera.
- `useSongChange.ts`: a new song, on a beat.
- `useSongRender.ts`: render a song.
- `useSongShows.ts`: a song's show, ticking every frame (`SONG_SHOW_TICK_MS`) on `positionNow` when given.
- `useUserPresets.ts`: own presets.
- `useWakeLock.ts`: screen stays on.

## Checks

`npm run lint` always. Sound (`useAudioAnalyzer`): `shelf`, `music`, `ears`, `renders`, `kicks`, `clicks`. `useCastSession`, `useProjector`: `desktop`. `useRemoteLink`: `applink`, `remotemix`, `phonelink`, `tv`. `useDeviceTilt`: `phone`, `layout`. `useDeskLayout`: `panel`, `desk`.
